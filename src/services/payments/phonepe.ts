type PhonePeAccessTokenResponse = {
    access_token: string;
    expires_at: number;
    token_type: string;
};

type PhonePeCreatePaymentResponse = {
    orderId: string;
    state: string;
    expireAt?: number;
    expiryAt?: number;
    redirectUrl: string;
};

type PhonePePaymentDetail = {
    transactionId?: string;
    state?: string;
    instrument?: Record<string, unknown>;
};

export type PhonePeOrderStatusResponse = {
    orderId: string;
    state: "PENDING" | "FAILED" | "COMPLETED" | string;
    amount: number;
    expireAt?: number;
    paymentDetails?: PhonePePaymentDetail[];
    metaInfo?: Record<string, unknown>;
    errorCode?: string;
    detailedErrorCode?: string;
    errorContext?: Record<string, unknown>;
};

type PhonePeConfig = {
    merchantId: string;
    clientId: string;
    clientSecret: string;
    clientVersion: string;
    baseUrl: string;
    redirectUrl: string;
};

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

function getPhonePeConfig(): PhonePeConfig {
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const clientId = process.env.PHONEPE_CLIENT_ID;
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    const clientVersion = process.env.PHONEPE_CLIENT_VERSION;
    const baseUrl = process.env.PHONEPE_BASE_URL;
    const redirectUrl = process.env.PHONEPE_REDIRECT_URL;

    if (!merchantId || !clientId || !clientSecret || !clientVersion || !baseUrl || !redirectUrl) {
        throw new Error(
            "PhonePe is not configured. Set PHONEPE_MERCHANT_ID, PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION, PHONEPE_BASE_URL, and PHONEPE_REDIRECT_URL.",
        );
    }

    return {
        merchantId,
        clientId,
        clientSecret,
        clientVersion,
        baseUrl: baseUrl.replace(/\/$/, ""),
        redirectUrl,
    };
}

function getPhonePeAuthUrl(baseUrl: string) {
    return baseUrl.includes("pg-sandbox")
        ? "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token"
        : "https://api.phonepe.com/apis/identity-manager/v1/oauth/token";
}

async function readErrorMessage(response: Response) {
    const text = await response.text();

    try {
        const json = JSON.parse(text) as { message?: string; code?: string };
        return json.message ?? json.code ?? text;
    } catch {
        return text;
    }
}

async function getAccessToken() {
    if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
        return cachedToken.accessToken;
    }

    const config = getPhonePeConfig();
    const authUrl = getPhonePeAuthUrl(config.baseUrl);
    const body = new URLSearchParams({
        client_id: config.clientId,
        client_version: config.clientVersion,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
    });

    const response = await fetch(authUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`PhonePe authorization failed: ${await readErrorMessage(response)}`);
    }

    const data = (await response.json()) as PhonePeAccessTokenResponse;
    cachedToken = {
        accessToken: data.access_token,
        expiresAtMs: data.expires_at * 1000,
    };

    return data.access_token;
}

function buildRedirectUrl(baseRedirectUrl: string, merchantOrderId: string) {
    const url = new URL(baseRedirectUrl);
    url.searchParams.set("merchantOrderId", merchantOrderId);
    return url.toString();
}

export async function initiatePhonePePayment(params: {
    merchantOrderId: string;
    amount: number;
    metaInfo?: Record<string, string>;
}) {
    const config = getPhonePeConfig();
    const accessToken = await getAccessToken();
    const response = await fetch(`${config.baseUrl}/checkout/v2/pay`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `O-Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            merchantOrderId: params.merchantOrderId,
            amount: params.amount,
            expireAfter: 1200,
            paymentFlow: {
                type: "PG_CHECKOUT",
                merchantUrls: {
                    redirectUrl: buildRedirectUrl(config.redirectUrl, params.merchantOrderId),
                },
            },
            metaInfo: params.metaInfo,
        }),
    });

    if (!response.ok) {
        throw new Error(`PhonePe create payment failed: ${await readErrorMessage(response)}`);
    }

    return (await response.json()) as PhonePeCreatePaymentResponse;
}

export async function getPhonePeOrderStatus(merchantOrderId: string) {
    const config = getPhonePeConfig();
    const accessToken = await getAccessToken();
    const response = await fetch(
        `${config.baseUrl}/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=true&errorContext=true`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Authorization: `O-Bearer ${accessToken}`,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`PhonePe status lookup failed: ${await readErrorMessage(response)}`);
    }

    return (await response.json()) as PhonePeOrderStatusResponse;
}