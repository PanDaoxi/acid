/*

《Acid 免责声明》

1. 性质声明
	Acid 仅为技术演示工具，所有请求均模拟浏览器行为，不修改、不存储任何目标网站数据。
2. 合法使用
	禁止用于：
		- 绕过付费内容限制
		- 攻击性爬虫
		- 违反《计算机信息网络国际联网安全保护管理办法》的行为
3. 即时失效
	部分网站可能随时升级防护，导致工具失效，不提供维护承诺。
4. 风险警示
	使用后若出现：
		- IP 被目标站封禁
		- 法律风险
	需自行承担全部责任。

---

*Acid Disclaimer*

1. Nature
	Acid is a technical demo ONLY. It simulates browser requests without **modifying/storing** any target site data.
2. Legal Use
	Prohibited for:
		- Bypassing paywalls
		- Aggressive scraping
		- Violating cybersecurity laws
3. No Guarantee
	Tool may break if targets update protections. **No maintenance promised.**
4. Warning
	You risk:
		- IP bans by targets
		- Legal consequences
	All liabilities are on you.

Copyright 2025 by PanDaoxi.
*/

// 工具函数定义
const generateChinaIP = () => {
	const pools = [
		`116.25.${Math.floor(Math.random() * 255)}.${Math.floor(
			Math.random() * 255
		)}`, // 广东电信
		`220.181.${Math.floor(Math.random() * 255)}.${Math.floor(
			Math.random() * 255
		)}`, // 北京百度
		`111.206.${Math.floor(Math.random() * 255)}.${Math.floor(
			Math.random() * 255
		)}`, // 北京联通
	];
	return pools[Math.floor(Math.random() * pools.length)];
};

const getMimeTypeFromUrl = (url) => {
	const extension = url.split(".").pop().toLowerCase();
	const types = {
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
	};
	return types[extension] || "application/octet-stream";
};

const buildHeaders = (url, config, strategy) => {
	const headers = {
		...config.default?.headers,
		...strategy.headers,
		Host: new URL(url).hostname,
	};

	// 动态处理函数式header
	Object.entries(headers).forEach(([key, value]) => {
		if (typeof value === "function") {
			headers[key] = value(url);
		}
	});

	// 添加cookies
	if (config.cookies) {
		headers.Cookie = Object.entries(config.cookies)
			.map(([k, v]) => `${k}=${v}`)
			.join("; ");
	}

	return headers;
};

// 动态策略配置
const DYNAMIC_CONFIG = {
	default: {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
			Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			"Accept-Encoding": "gzip, deflate, br",
		},
		strategies: [
			{
				name: "google-referer",
				headers: { Referer: "https://www.google.com/" },
			},
			{
				name: "target-origin",
				headers: { Referer: (url) => `${new URL(url).origin}/` },
			},
			{
				name: "social-media",
				headers: {
					Referer: "https://www.facebook.com/",
					"X-Forwarded-For": generateChinaIP(),
				},
			},
		],
	},
	"csdnimg.cn": {
		cookies: {
			dc_session_id: Date.now().toString(36),
			dc_tracker: "true",
		},
		strategies: [
			{
				name: "baidu-referer",
				headers: { Referer: "https://www.baidu.com/" },
			},
		],
	},
};

// 响应辅助函数
const methodNotAllowed = () => ({
	statusCode: 405,
	body: "Method Not Allowed",
});

const badRequest = (message) => ({
	statusCode: 400,
	body: message,
});

const getSiteConfig = (hostname) => {
	const domain = hostname.replace("www.", "");
	return DYNAMIC_CONFIG[domain] || DYNAMIC_CONFIG.default;
};

// 主处理函数
exports.handler = async (event) => {
	if (event.httpMethod !== "GET") return methodNotAllowed();

	const targetUrl = event.queryStringParameters.url;
	if (!targetUrl) return badRequest("Missing URL parameter");

	try {
		const { hostname } = new URL(targetUrl);
		const siteConfig = getSiteConfig(hostname);

		let lastError;
		for (const strategy of siteConfig.strategies) {
			try {
				const headers = buildHeaders(targetUrl, siteConfig, strategy);
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 10000);

				const response = await fetch(targetUrl, {
					headers,
					signal: controller.signal,
					redirect: "follow",
				});

				clearTimeout(timeout);

				if (response.ok) {
					const buffer = await response
						.arrayBuffer()
						.then(Buffer.from);
					return {
						statusCode: 200,
						headers: {
							"Content-Type":
								response.headers.get("content-type") ||
								getMimeTypeFromUrl(targetUrl),
							"Cache-Control": "public, max-age=86400",
							"Access-Control-Allow-Origin": "*",
							"X-Proxy-Strategy": strategy.name,
						},
						body: buffer.toString("base64"),
						isBase64Encoded: true,
					};
				}

				lastError = {
					status: response.status,
					statusText: response.statusText,
				};
			} catch (error) {
				lastError = error;
			}
		}

		return {
			statusCode: lastError.status || 502,
			body: lastError.statusText || "Proxy Gateway Error",
		};
	} catch (error) {
		console.error("Proxy error:", error);
		return {
			statusCode: 500,
			body: `Internal Server Error: ${error.message}`,
		};
	}
};
