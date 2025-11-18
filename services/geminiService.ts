import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { ChatMessage } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const safetySettings = [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
];

export const createChatSession = (): Chat => {
  const model = 'gemini-2.5-flash';
  return ai.chats.create({
    model,
    config: {
      temperature: 0.7,
      topP: 0.95,
      topK: 64,
      systemInstruction: "تۆ دانایت، یاریدەدەرێکی زیرەکیت. بە شێوەیەکی خۆماڵانە و دۆستانە وەڵامی هەموو پرسیارەکان بدەرەوە بە زمانی کوردی (سۆرانی). وەڵامەکانت خێرا و پوخت بن.",
      // FIX: The 'safetySettings' property must be nested inside the 'config' object for chat creation. The 'generationConfig' constant has been removed as it is deprecated.
      safetySettings,
    },
  });
};

export const generateTextResponse = async (
  chat: Chat,
  prompt: string,
  image?: { data: string; mimeType: string }
): Promise<string> => {
  try {
    let content: any = { message: prompt };
    if (image) {
      const imagePart = {
        inlineData: {
          mimeType: image.mimeType,
          data: image.data,
        },
      };
      const textPart = { text: prompt || "ڕوونکردنەوەی ئەم وێنەیە بدە" };
      content = { parts: [imagePart, textPart] };
    }
    
    const response = await chat.sendMessage(content);
    return response.text;
  } catch (error) {
    console.error("Error generating text response:", error);
    return "ببورە، لە ئێستادا ناتوانم وەڵامت بدەمەوە. تکایە دواتر هەوڵبدەرەوە.";
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("Error generating speech:", error);
    return null;
  }
};
