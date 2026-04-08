export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Please add ANTHROPIC_API_KEY to Vercel environment variables.' });
  }

  try {
    const { brandName, dateRange, competitors } = req.body;

    if (!brandName) {
      return res.status(400).json({ error: 'Brand name is required' });
    }

    const systemPrompt = `你是專業的品牌聲量分析師。請使用網路搜尋工具，搜尋關於「${brandName}」在 ${dateRange.from} 到 ${dateRange.to} 期間的網路討論、新聞、評價。

請進行多次搜尋以獲得完整資料：
1. "${brandName} 評價 ${dateRange.to.slice(0,7)}"
2. "${brandName} PTT Dcard"
3. "${brandName} 新聞 最新"
4. "${brandName} 討論 社群"

分析所有結果後，請以下列 JSON 格式回覆（只回傳 JSON）：

{
  "brandName": "${brandName}",
  "dateRange": "${dateRange.from} ~ ${dateRange.to}",
  "overallScore": 0到100的整體聲量分數,
  "totalMentions": 估計總提及數,
  "sentiment": {
    "positive": 正面數量,
    "neutral": 中性數量,
    "negative": 負面數量
  },
  "sentimentScore": -100到100的情緒分數,
  "topMentions": [
    {
      "rank": 1到10,
      "topic": "話題標題",
      "summary": "這個話題在討論什麼（30-50字）",
      "count": 提及次數,
      "sentiment": "positive/neutral/negative",
      "platforms": ["PTT", "Facebook", "News"],
      "insight": "這個話題的商業洞察（20-30字）"
    }
  ],
  "platformBreakdown": [
    { "platform": "社群媒體", "percentage": 數字, "trend": "up/down/stable" },
    { "platform": "新聞媒體", "percentage": 數字, "trend": "up/down/stable" },
    { "platform": "論壇討論", "percentage": 數字, "trend": "up/down/stable" }
  ],
  "keyInsights": [
    "關鍵洞察1（一句話）",
    "關鍵洞察2（一句話）",
    "關鍵洞察3（一句話）"
  ],
  "recommendations": [
    "建議行動1",
    "建議行動2"
  ],
  "timeAnalysis": {
    "peakPeriod": "聲量高峰期間描述",
    "trend": "上升/下降/持平",
    "keyEvents": ["重要事件1", "重要事件2"]
  }
}

請確保 topMentions 包含 10 項最多人討論的話題，並依照熱度排序。`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: systemPrompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return res.status(response.status).json({ error: `API error: ${response.status}` });
    }

    const data = await response.json();
    
    // Extract text content
    let textContent = '';
    for (const block of data.content) {
      if (block.type === 'text') {
        textContent += block.text;
      }
    }

    // Parse JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysisData = JSON.parse(jsonMatch[0]);
      return res.status(200).json(analysisData);
    } else {
      return res.status(200).json({
        brandName: brandName,
        dateRange: `${dateRange.from} ~ ${dateRange.to}`,
        summary: textContent.slice(0, 500),
        sentiment: { positive: 0, neutral: 1, negative: 0 },
        topMentions: [],
        error: 'Could not parse structured response'
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
}
