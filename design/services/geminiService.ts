
import { GoogleGenAI, Type } from "@google/genai";
import { MedicalSynthesis } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async synthesizeResearch(query: string, data: any[]): Promise<MedicalSynthesis> {
    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Perform a high-level medical synthesis of the following research papers for the query: "${query}". 
      Data: ${JSON.stringify(data)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keyInsights: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            clinicalSignificance: { type: Type.STRING },
            futureDirections: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "keyInsights", "clinicalSignificance", "futureDirections"]
        }
      }
    });

    try {
      return JSON.parse(response.text.trim()) as MedicalSynthesis;
    } catch (e) {
      console.error("Failed to parse synthesis result", e);
      throw new Error("Invalid AI response");
    }
  }
}

export const geminiService = new GeminiService();
