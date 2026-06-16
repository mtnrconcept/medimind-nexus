"""
OpenAI AI client for the Python NLP service.

This mirrors the Supabase Edge Function policy: one server-side OpenAI
provider, clinical routing by risk, and no browser-exposed provider keys.
"""

from dataclasses import dataclass
import inspect
import os
from typing import Any, Callable, Dict, Iterable, Optional

import httpx


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-5.5"
DEFAULT_SIMPLE_OPENAI_MODEL = "gpt-5.4-mini"
DEFAULT_TIMEOUT_SECONDS = 90
CLINICAL_CONTRACT_MARKER = "CONTRAT CLINIQUE VERIFIABLE"


@dataclass
class AIResponse:
    """Response from the OpenAI provider."""

    text: str
    provider: str
    model: str
    reasoning_effort: str
    clinical_route: str


@dataclass
class ClinicalRoute:
    model: str
    reasoning_effort: str
    route: str


CRITICAL_TERMS = (
    "anticoagulant",
    "antiarythm",
    "benzodiazep",
    "insulin",
    "lithium",
    "methotrexate",
    "opioid",
    "qt long",
    "serotonin",
    "serotoninerg",
    "immunosupp",
    "pregnan",
    "grossesse",
    "enfant",
    "child",
    "elderly",
    "personne agee",
    "renal",
    "renale",
    "kidney",
    "hepatic",
    "hepatique",
    "foie",
    "polypharm",
    "polymedic",
    "overdose",
    "surdosage",
    "contraindication",
    "red flag",
    "urgence",
)

CLINICAL_TERMS = (
    "diagnosis",
    "diagnostic",
    "differential",
    "patholog",
    "symptom",
    "traitement",
    "treatment",
    "medicament",
    "drug",
    "molecule",
    "interaction",
    "contraindication",
    "clinical",
    "clinique",
    "patient",
    "pubmed",
    "source",
    "evidence",
    "preuve",
)


CLINICAL_CONTRACT = f"""
{CLINICAL_CONTRACT_MARKER}

You are a clinical research assistant. You must not prescribe or replace a
qualified clinician. Use retrieved sources as evidence and distinguish:
confirmed interaction, theoretical interaction, no data, and contradictory data.
Do not conclude that a drug interaction or treatment recommendation exists
unless it is supported by the supplied sources or explicitly marked as a
theoretical hypothesis. Return uncertainty, red flags, and source URLs whenever
available. Escalate safety warnings for pregnancy, children, older adults,
renal/hepatic impairment, anticoagulants, opioids, benzodiazepines,
antiarrhythmics, lithium, methotrexate, insulin, antidiabetics,
antiepileptics, and immunosuppressants.
""".strip()


def _contains_any(text: str, terms: Iterable[str]) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in terms)


def _is_openai_model(model: Optional[str]) -> bool:
    if not model:
        return False

    normalized = model.strip().lower()
    return normalized.startswith(("gpt-", "gpt.", "o1", "o3", "o4"))


def _env_model(name: str, fallback: str) -> str:
    value = os.getenv(name, "").strip()
    return value if _is_openai_model(value) else fallback


def _select_clinical_route(
    system_prompt: str,
    user_prompt: str,
    requested_model: Optional[str],
) -> ClinicalRoute:
    text = f"{system_prompt}\n\n{user_prompt}"
    default_model = _env_model("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
    simple_model = _env_model("OPENAI_SIMPLE_MODEL", DEFAULT_SIMPLE_OPENAI_MODEL)
    critical_model = _env_model("OPENAI_CRITICAL_MODEL", default_model)

    if requested_model and not _is_openai_model(requested_model):
        print(
            f"[AI-Client] Ignoring non-OpenAI model '{requested_model}'. "
            f"Using OPENAI_API_KEY with {default_model}."
        )

    if _contains_any(text, CRITICAL_TERMS):
        return ClinicalRoute(
            model=critical_model,
            reasoning_effort=os.getenv("OPENAI_CRITICAL_REASONING", "xhigh"),
            route="critical_review",
        )

    if _contains_any(text, CLINICAL_TERMS):
        return ClinicalRoute(
            model=default_model,
            reasoning_effort=os.getenv("OPENAI_CLINICAL_REASONING", "high"),
            route="clinical_reasoning",
        )

    if _is_openai_model(requested_model):
        return ClinicalRoute(
            model=requested_model.strip(),
            reasoning_effort=os.getenv("OPENAI_SIMPLE_REASONING", "low"),
            route="explicit_openai",
        )

    return ClinicalRoute(
        model=simple_model,
        reasoning_effort=os.getenv("OPENAI_SIMPLE_REASONING", "low"),
        route="simple_lookup",
    )


def _build_system_prompt(system_prompt: str, route: ClinicalRoute) -> str:
    if route.route == "simple_lookup":
        return system_prompt

    if CLINICAL_CONTRACT_MARKER in system_prompt:
        return system_prompt

    return f"{system_prompt.strip()}\n\n{CLINICAL_CONTRACT}"


def _supports_temperature(model: str) -> bool:
    normalized = model.strip().lower()
    return not normalized.startswith(("gpt-5", "gpt.5"))


def _supports_reasoning(model: str) -> bool:
    normalized = model.strip().lower()
    return normalized.startswith(("gpt-5", "gpt.5", "o1", "o3", "o4"))


def _extract_response_text(data: Dict[str, Any]) -> str:
    output_text = data.get("output_text")
    if isinstance(output_text, str):
        return output_text

    chunks = []
    output = data.get("output")
    if not isinstance(output, list):
        return ""

    for item in output:
        if not isinstance(item, dict):
            continue

        content = item.get("content")
        if not isinstance(content, list):
            continue

        for part in content:
            if not isinstance(part, dict):
                continue

            text = part.get("text")
            if isinstance(text, str):
                chunks.append(text)

    return "".join(chunks)


async def _maybe_call_chunk(on_chunk: Callable[[str], Any], text: str) -> None:
    result = on_chunk(text)
    if inspect.isawaitable(result):
        await result


async def call_ai(
    system_prompt: str,
    user_prompt: str,
    model: str = DEFAULT_OPENAI_MODEL,
    max_tokens: int = 4000,
    temperature: float = 0.7,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> AIResponse:
    """
    Call OpenAI using the server-side OPENAI_API_KEY.

    Non-OpenAI model names are ignored so older callers can be migrated without
    accidentally activating another provider.
    """

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise Exception("OPENAI_API_KEY not configured")

    route = _select_clinical_route(system_prompt, user_prompt, model)
    routed_system_prompt = _build_system_prompt(system_prompt, route)
    timeout = timeout_seconds or int(os.getenv("OPENAI_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))

    body: Dict[str, Any] = {
        "model": route.model,
        "max_output_tokens": max_tokens,
        "input": [
            {"role": "system", "content": routed_system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    if _supports_reasoning(route.model):
        body["reasoning"] = {"effort": route.reasoning_effort}

    if _supports_temperature(route.model):
        body["temperature"] = temperature

    print(
        f"[AI-Client] OpenAI route={route.route} model={route.model} "
        f"reasoning={route.reasoning_effort}"
    )

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            OPENAI_RESPONSES_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )

    if response.status_code >= 400:
        raise Exception(f"OpenAI Responses request failed ({response.status_code}): {response.text}")

    data = response.json()
    text = _extract_response_text(data)
    if not text.strip():
        status = data.get("status", "unknown")
        details = data.get("incomplete_details", "no text output")
        raise Exception(f"OpenAI returned an empty response (status: {status}, reason: {details})")

    return AIResponse(
        text=text,
        provider="openai",
        model=route.model,
        reasoning_effort=route.reasoning_effort,
        clinical_route=route.route,
    )


async def stream_ai(
    system_prompt: str,
    user_prompt: str,
    on_chunk: Callable[[str], Any],
    model: str = DEFAULT_OPENAI_MODEL,
    max_tokens: int = 4000,
    temperature: float = 0.7,
    timeout_seconds: int = 120,
) -> AIResponse:
    """
    Stream-compatible wrapper.

    The Python service currently emits one server-side chunk after the OpenAI
    response. This preserves the existing callback contract without adding a
    second provider or exposing client-side keys.
    """

    response = await call_ai(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout_seconds=timeout_seconds,
    )
    await _maybe_call_chunk(on_chunk, response.text)
    return response
