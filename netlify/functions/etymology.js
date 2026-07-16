// Bu fonksiyon tarayıcıdan gelen isteği alır, Google Gemini API'yi
// GEMINI_API_KEY (Netlify ortam değişkeni) ile sunucu tarafında çağırır,
// ve sonucu tarayıcıya geri döner. API anahtarı hiçbir zaman tarayıcıya gitmez.
// Gemini API'nin kredi kartsız, ücretsiz bir katmanı var: aistudio.google.com

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY ortam değişkeni ayarlanmamış." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let word;
  try {
    const body = await req.json();
    word = (body.word || "").trim();
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz istek gövdesi." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!word) {
    return new Response(JSON.stringify({ error: "Kelime boş olamaz." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const systemPrompt = `Sen bir etimoloji uzmanısın. Kullanıcının verdiği kelime veya kısa ifadenin köken bilgisini araştırıp SADECE aşağıdaki JSON şemasına uygun, geçerli JSON döndüreceksin. Başka hiçbir metin, açıklama, markdown ya da kod bloğu işareti ekleme — yanıtın doğrudan parse edilecek saf JSON olmalı.

Tüm metinler TÜRKÇE olmalı (kelimenin/kökün orijinal yazımı hariç). Bilgi net değilse veya spekülatifse bunu belirt, uydurma kesinlik iddia etme. timeline dizisini EN ESKİ katmandan başlayarak günümüze doğru sırala, 3 ila 6 katman arası olsun. cognates dizisinde 3-6 akraba kelime ver (varsa Türkçesini de dahil et).

Şema:
{
  "word": "kullanıcının yazdığı kelime",
  "ipa": "biliniyorsa IPA/telaffuz, yoksa boş string",
  "origin_family": "kısa köken etiketi, örn. 'Proto-Türkçe' ya da 'Latince > Fransızca'",
  "summary": "1-2 cümlelik özet, kökeni ve yolculuğu anlatan",
  "timeline": [
    {"era": "dönem/dil adı", "period": "yaklaşık tarih", "form": "o dönemdeki yazılışı/kökü", "meaning": "o dönemdeki anlamı veya kısa not"}
  ],
  "cognates": [
    {"language": "dil adı", "word": "o dildeki akraba kelime"}
  ],
  "fun_fact": "ilginç, az bilinen bir detay - 1-2 cümle"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `Kelime/ifade: ${word}` }] },
          ],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 1500,
          },
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message || "Gemini API hatası" }),
        { status: geminiRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    let clean = text.replace(/```json|```/g, "").trim();
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Bilinmeyen hata" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/etymology",
};
