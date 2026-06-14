
import { GoogleGenAI, Type } from "@google/genai";
import { AiSuggestion } from "../types";

const apiKey = process.env.API_KEY || '';
const getAiClient = () => {
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const POPULAR_SUBSCRIPTIONS: AiSuggestion[] = [
  { name: "Netflix Standard", estimatedPrice: 15.49, category: "Entertainment", billingCycle: "Monthly", currency: "USD" },
  { name: "Spotify Premium", estimatedPrice: 10.99, category: "Music", billingCycle: "Monthly", currency: "USD" },
  { name: "YouTube Premium", estimatedPrice: 13.99, category: "Entertainment", billingCycle: "Monthly", currency: "USD" },
  { name: "Amazon Prime", estimatedPrice: 14.99, category: "Shopping", billingCycle: "Monthly", currency: "USD" },
  { name: "Disney+", estimatedPrice: 13.99, category: "Entertainment", billingCycle: "Monthly", currency: "USD" },
  { name: "ChatGPT Plus", estimatedPrice: 20.00, category: "Productivity", billingCycle: "Monthly", currency: "USD" },
  { name: "Apple One", estimatedPrice: 19.95, category: "Bundle", billingCycle: "Monthly", currency: "USD" },
  { name: "Dropbox Plus", estimatedPrice: 11.99, category: "Storage", billingCycle: "Monthly", currency: "USD" },
];

export const getSubscriptionSuggestions = async (query: string): Promise<AiSuggestion[]> => {
  // Return dummy list if query matches "popular" or if no API key
  if (!apiKey || query.toLowerCase().includes('popular')) {
    return POPULAR_SUBSCRIPTIONS;
  }

  try {
    const ai = getAiClient();
    if (!ai) return POPULAR_SUBSCRIPTIONS;

    const model = "gemini-2.5-flash";
    const prompt = `Generate a list of popular subscription services related to: "${query}". 
    If the query is empty or generic, provide a diverse mix of popular global subscriptions.
    Provide estimated prices in USD.`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              estimatedPrice: { type: Type.NUMBER },
              category: { type: Type.STRING },
              billingCycle: { type: Type.STRING, "enum": ['Monthly', 'Yearly'] },
              currency: { type: Type.STRING }
            },
            required: ['name', 'estimatedPrice', 'category']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return POPULAR_SUBSCRIPTIONS;
    
    return JSON.parse(text) as AiSuggestion[];
  } catch (error) {
    console.error("Gemini API Error:", error);
    return POPULAR_SUBSCRIPTIONS;
  }
};

export const parseInvoiceText = async (text: string): Promise<{
  name?: string;
  price?: number;
  currency?: string;
  billingCycle?: string;
  firstPaymentDate?: string;
  category?: string;
}> => {
  if (!apiKey) throw new Error("API Key required");

  try {
    const ai = getAiClient();
    if (!ai) throw new Error("API Key required");

    const model = "gemini-2.5-flash";
    const prompt = `Extract subscription details from the following invoice or email text. 
    Return a JSON object with name, price (number), currency (code like USD, EUR), billingCycle (Monthly, Yearly), and firstPaymentDate (YYYY-MM-DD).
    If date is not found, use today's date.
    
    Text: "${text}"`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
           type: Type.OBJECT,
           properties: {
             name: { type: Type.STRING },
             price: { type: Type.NUMBER },
             currency: { type: Type.STRING },
             billingCycle: { type: Type.STRING, "enum": ['Daily', 'Weekly', 'Monthly', 'Yearly', 'Free Trial'] },
             firstPaymentDate: { type: Type.STRING },
             category: { type: Type.STRING }
           }
        }
      }
    });

    const result = response.text;
    if (!result) return {};
    return JSON.parse(result);
  } catch (e) {
    console.error("Failed to parse invoice", e);
    throw e;
  }
};

export const generateNaughtyReminder = async (serviceName: string, personName: string, price: string): Promise<string> => {
    if (!apiKey) return `Hey ${personName}, pay me ${price} for ${serviceName} please!`;

    try {
        const ai = getAiClient();
        if (!ai) return `Hey ${personName}, pay me ${price} for ${serviceName} please!`;

        const model = "gemini-2.5-flash";
        const prompt = `Write a short, funny, passive-aggressive, "evil Duolingo owl" style notification message reminding ${personName} that they still haven't paid me ${price} for our shared ${serviceName} subscription. It should be dramatic but friendly. Max 30 words.`;
        
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });

        return response.text || `Pay up for ${serviceName}, ${personName}!`;
    } catch (e) {
        return `Reminder: You owe ${price} for ${serviceName}.`;
    }
}

export const generateAppLogo = async (prompt: string): Promise<string | null> => {
  if (!apiKey) return null;

  try {
    const ai = getAiClient();
    if (!ai) return null;

    // Nano Banana / Flash Image model
    const model = 'gemini-2.5-flash-image';
    const finalPrompt = `A high quality, modern, minimalist mobile app icon for a subscription tracker app. 
    Style: ${prompt}. 
    Constraints: Flat or 3D vector style, solid distinctive background, suitable for iOS/Android icon. No text. Square aspect ratio.`;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: finalPrompt }]
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
           return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (e) {
    console.error("Logo generation failed", e);
    return null;
  }
};
