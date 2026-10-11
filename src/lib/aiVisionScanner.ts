import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

export interface RecognizeResult {
  text: string;
  meanConfidence: number;
  isTruncated: boolean;
}

export async function scanImageWithAI(imageBase64OrUrl: string): Promise<RecognizeResult> {
  try {
    const imageUrl = imageBase64OrUrl.startsWith("data:")
      ? imageBase64OrUrl
      : `data:image/jpeg;base64,${imageBase64OrUrl}`;

    const completion = await groq.chat.completions.create({
  model: "qwen/qwen3.8-27b",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
            text: "Extract all readable text from this product label. Note: If the product name at the top is stacked across multiple lines (like 'ORBIT' on top of 'WHITE'), join them together into a single combined name on the very first line (e.g., 'Orbit White'), followed by the rest of the text.",        },
        {
          type: "image_url",
          image_url: {
            url: imageUrl,
          },
        },
      ],
    },
  ],
  temperature: 0.1,
  max_tokens: 1024,
});

    const extractedText = completion.choices[0]?.message?.content || "";

    return {
      text: extractedText,
      meanConfidence: 0.95,
      isTruncated: false,
    };
  } catch (error) {
    console.error("AI Vision Scan Error:", error);
    return {
      text: "",
      meanConfidence: 0,
      isTruncated: false,
    };
  }
}