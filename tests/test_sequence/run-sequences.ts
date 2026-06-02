async function checkProductUrl(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const result = {
      originalUrl: url,
      finalUrl: response.url,
      redirected: response.redirected,
      status: response.status,
      ok: response.ok,
      classification: classifyResponse(response),
    };

    console.log(result);

    return result;
  } catch (error) {
    console.error("Request failed:", error);

    return {
      originalUrl: url,
      finalUrl: null,
      redirected: false,
      status: null,
      ok: false,
      classification: "NETWORK_ERROR",
    };
  }
}

function classifyResponse(response: Response): string {
  const status = response.status;

  if (status === 200) {
    if (response.redirected) {
      return "REDIRECTED_BUT_EXISTS";
    }

    return "PRODUCT_EXISTS";
  }

  if (status === 404) {
    return "PRODUCT_NOT_FOUND";
  }

  if (status === 403) {
    return "BLOCKED";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  if (status >= 500) {
    return "SERVER_ERROR";
  }

  return "UNKNOWN";
}
