import assert from "node:assert/strict";
import test from "node:test";
import { handleResearchRequest, type ResearchServices } from "../supabase/functions/deep-research-graph/handler.ts";
import { collectExternalSources, localSourceStatus, sourceProvenance } from "../supabase/functions/deep-research-graph/sources.ts";

test("disease query never searches the adverse-event medication field", async () => {
  let calls = 0;
  const result = await collectExternalSources("nephrotic syndrome", undefined, true, true, async () => {
    calls++;
    return Response.json({ esearchresult: { idlist: [], count: "0" } });
  });
  assert.equal(calls, 1);
  assert.equal(result.pubmed.status, "empty");
  assert.equal(result.fda.status, "skipped");
  assert.deepEqual(sourceProvenance([result.pubmed, result.fda]).sources_consulted, ["PubMed"]);
});

test("PubMed requires a valid search and resolves only IDs actually requested", async () => {
  const payloads = [{ esearchresult: { idlist: ["29913001", "99999"] } },
    { result: { uids: ["29913001", "777"], "29913001": { uid: "29913001", title: "Randomized trial" }, "777": { uid: "777", title: "Unrelated" } } }];
  const result = await collectExternalSources("nephrotic syndrome", undefined, true, false, async () => Response.json(payloads.shift()));
  assert.equal(result.pubmed.status, "partial");
  assert.deepEqual(result.pubmed.records.map(x => x.url), ["https://pubmed.ncbi.nlm.nih.gov/29913001/"]);
});

test("FDA distinguishes no matches from a failed upstream or invalid successful payload", async () => {
  for (const [response, expected] of [
    [Response.json({ error: { code: "NOT_FOUND", message: "No matches found!" } }, { status: 404 }), "empty"],
    [Response.json({}, { status: 404 }), "unavailable"],
    [Response.json({}, { status: 429 }), "unavailable"],
    [Response.json({}), "unavailable"],
  ] as const) {
    const result = await collectExternalSources("test", "rituximab", false, true, async (url) => {
      assert.equal(new URL(String(url)).searchParams.get("search"), 'patient.drug.medicinalproduct:"rituximab"');
      return response;
    });
    assert.equal(result.fda.status, expected);
  }
});

test("partial and failed local table reads never pass as negative evidence", () => {
  const partial = localSourceStatus([{ table: "pathologies", count: 0, failed: false }, { table: "treatments", count: 0, failed: true }]);
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.failed_tables, ["treatments"]);
  const failed = localSourceStatus([{ table: "pathologies", count: 0, failed: true }]);
  assert.equal(failed.status, "unavailable");
  assert.deepEqual(sourceProvenance([failed]).sources_consulted, []);
  assert.equal(sourceProvenance([failed]).source_statuses[0].status, "unavailable");
});


function researchRequest(data: Record<string, unknown>) {
  return new Request("https://example.test/deep-research-graph", {
    method: "POST", headers: { authorization: "Bearer user-session" }, body: JSON.stringify(data),
  });
}

const offline: ResearchServices = {
  async isAuthenticated(token) { return token === "user-session"; },
  async readInteractions() { return []; },
  async readTable(table) {
    if (table.table === "medications") throw new Error("Upstream unavailable");
    return [];
  },
  async callAI() { return { text: "", model: "", provider: "none" }; },
  async fetcher() { return Response.json({}, { status: 429 }); },
};

test("JSON and streamed fallback retain actual source failures and skipped lookups", async () => {
  const input = { topic: "disease" };
  const response = await handleResearchRequest(researchRequest(input), offline);
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.ai_model, "fallback");
  assert.deepEqual(json.sources_consulted, ["Base locale"]);
  assert.deepEqual(json.source_statuses.map((s: { status: string }) => s.status), ["partial", "unavailable", "skipped", "unavailable"]);
  const stream = await handleResearchRequest(researchRequest({ ...input, streaming: true }), offline);
  assert.match(stream.headers.get("Content-Type") ?? "", /event-stream/);
  const events = (await stream.text()).trim().split("\n\n").map(row => JSON.parse(row.slice(6)));
  assert.deepEqual(events.at(-1).source_statuses, json.source_statuses);
  assert.deepEqual(events.at(-1).sources_consulted, json.sources_consulted);
  assert.equal(json.research_status, 'unavailable');
  assert.ok(json.limitations.length > 0);
  assert.ok(!json.nodes.some((n: { id: string }) => n.id === 'evidence_gap'));
  assert.deepEqual(json.edges, []);
});

test("AI cannot invent consulted sources, upgrade a hypothesis, or place unrelated edges in an expansion", async () => {
  const services = { ...offline, async callAI() {
    return { model: "test", provider: "stub", text: JSON.stringify({
      nodes: [{ id: "c0", label: "disease", node_type: "PATHOLOGY", weight: 1, source: "Guideline" }],
      edges: [{ source_id: "c0", target_id: "existing", edge_type: "ASSOCIATED_WITH" },
        { source_id: "c0", target_id: "forged", edge_type: "CAUSES" }],
      sources_consulted: ["invented"], source_statuses: [{ source: "invented", status: "available" }],
    }) };
  } };
  const input = { topic: "disease", existing_nodes: [{ name: "existing", node_type: "SYMPTOM" }] };
  const data = await (await handleResearchRequest(researchRequest(input), services)).json();
  assert.deepEqual(data.sources_consulted, ["Base locale"]);
  assert.equal(data.nodes[0].source, "Recherche");
  assert.equal(data.from_cache, false);
  assert.deepEqual(data.edges.map((e: { target_id: string }) => e.target_id), ["existing"]);
  const other = await (await handleResearchRequest(researchRequest({ topic: "disease" }), services)).json();
  assert.deepEqual(other.edges, []);
});

test("oversized requests and malformed medication are rejected before research starts", async () => {
  const unused = { ...offline, async callAI() { assert.fail("Invalid input reached synthesis"); } };
  for (const data of [{ topic: "x".repeat(97000) }, { topic: "x", medication: 'drug" OR *' }, { topic: "x", max_nodes: -3 }]) {
    assert.equal((await handleResearchRequest(researchRequest(data), unused)).status, 400);
  }
});

test("PubMed errorlists, missing counts, and inconsistent positive counts are not empty searches", async () => {
  for (const esearchresult of [{ count: "0", idlist: [], errorlist: { phrasesnotfound: ["bad"] } },
    { idlist: [] }, { count: "4", idlist: [] }]) {
    const { pubmed } = await collectExternalSources("bad", undefined, true, false,
      async () => Response.json({ esearchresult }));
    assert.equal(pubmed.status, "unavailable");
  }
});

test("invalid/missing user authentication prevents all research, including AI calls", async () => {
  const services: ResearchServices = { ...offline,
    async readTable() { assert.fail("Read before authentication"); },
    async callAI() { assert.fail("AI called before authentication"); },
    async fetcher() { assert.fail("External research before authentication"); },
  };
  for (const auth of [undefined, "Bearer anonymous-project-key"]) {
    const request = researchRequest({ topic: "disease" });
    if (auth) request.headers.set("authorization", auth);
    else request.headers.delete("authorization");
    assert.equal((await handleResearchRequest(request, services)).status, 401);
  }
  assert.equal((await handleResearchRequest(researchRequest({ topic: "disease" }), { ...services,
    async isAuthenticated() { throw new Error("Auth server down"); } })).status, 503);
});

test("only interactions from matched medication IDs reach synthesis, and fallback keeps both centres without invented relations", async () => {
  let interactions: Array<{ id: string }> = [];
  const services: ResearchServices = { ...offline,
    async readTable(table) {
      return table.table === "medications" ? [{ id: "med1", name: "test medication", description: null }] : [];
    },
    async readInteractions(ids) {
      assert.deepEqual(ids, ["med1"]);
      return [{ id: "matching", medication_id: "med1", interacting_drug: "other", severity: null, description: null },
        { id: "unrelated", medication_id: "other", interacting_drug: "Unrelated", severity: null, description: null }];
    },
    async callAI(_system, prompt) {
      interactions = JSON.parse(prompt).drug_interactions;
      return { text: '', model: '', provider: 'none' };
    },
  };
  const data = await (await handleResearchRequest(researchRequest({
    topic: "A + B", pathologies: ["A", "B"], include_fda: false, include_pubmed: false,
  }), services)).json();
  assert.deepEqual(data.nodes.filter((node: { ring: number }) => node.ring === 0).map((node: { label: string }) => node.label), ["A", "B"]);
  assert.ok(data.search_matches.some((n: { id: string }) => n.id === 'medications_med1'));
  assert.deepEqual(interactions.map(interaction => interaction.id), ['matching']);
  assert.equal(data.nodes.length, 2);
  assert.ok(!JSON.stringify(data).includes("Unrelated"));
  assert.deepEqual(data.edges, []);
});

test("FAERS returns inspectable adverse-event reports without claiming causal evidence", async () => {
  const result = await collectExternalSources("rituximab", "rituximab", false, true,
    async () => Response.json({ results: [{ safetyreportid: "10003730", patient: { reaction: [{ reactionmeddrapt: "Example term" }] } }] }));
  assert.equal(result.fda.status, "available");
  assert.deepEqual(result.fda.records.map(r => [r.id, r.title]), [["10003730", "Example term"]]);
  assert.equal(new URL(result.fda.records[0].url).searchParams.get("search"), 'safetyreportid:"10003730"');
  assert.match(result.fda.detail ?? "", /causalité/);
});

test('PubMed abstract retrieval keeps publication type and population-bearing content without trusting titles alone', async () => {
  const xml = '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>12345678</PMID><Article>' +
    '<ArticleTitle>Article synthétique</ArticleTitle><Abstract><AbstractText Label="METHODS">Adults enrolled in a cohort.</AbstractText></Abstract>' +
    '<PublicationTypeList><PublicationType>Cohort Study</PublicationType></PublicationTypeList>' +
    '<Journal><PubDate><Year>2024</Year></PubDate></Journal></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>';
  const result = await collectExternalSources('synthetic topic', undefined, true, false, async url => {
    if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: ['12345678'], count: '1' } });
    if (url.includes('esummary')) return Response.json({ result: { '12345678': { uid: '12345678', title: 'Metadata title' } } });
    return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
  });
  assert.equal(result.pubmed.status, 'available');
  assert.equal(result.pubmed.records[0].content_level, 'abstract');
  assert.match(result.pubmed.records[0].abstract ?? '', /Adults enrolled/);
  assert.deepEqual(result.pubmed.records[0].publication_types, ['Cohort Study']);
  assert.equal(result.pubmed.records[0].year, '2024');
});

test('a retracted PubMed article is not promoted from its earlier bibliographic match', async () => {
  const result = await collectExternalSources('synthetic topic', undefined, true, false, async url => {
    if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: ['12345678'], count: '1' } });
    if (url.includes('esummary')) return Response.json({ result: { '12345678': { uid: '12345678', title: 'Retracted title' } } });
    return new Response('<PubmedArticle><PMID>12345678</PMID><ArticleTitle>Retracted title</ArticleTitle><PublicationType>Retracted Publication</PublicationType></PubmedArticle>');
  });
  assert.equal(result.pubmed.status, 'partial');
  assert.deepEqual(result.pubmed.records, []);
});
