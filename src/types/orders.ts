export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

export type PaymentProvider = "razorpay" | "phonepe";

export type PaymentStatus = "initiated" | "pending" | "paid" | "failed" | "refunded";

export type OrderType = "product" | "custom_print";

export interface OrderItem {
    productId: string;
    name: string;
    price: number;
    qty: number;
}

export interface ShippingAddress {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
}

export interface OrderRecord {
    userId: string;
    type: OrderType;
    items: OrderItem[];
    totalAmount: number;
    status: OrderStatus;
    shippingAddress: ShippingAddress;
    createdAt: unknown;
    paymentProvider?: PaymentProvider;
    paymentStatus?: PaymentStatus;
    merchantOrderId?: string;
    merchantTransactionId?: string;
    gatewayTransactionId?: string;
    paymentResponseCode?: string;
    paymentInstrument?: Record<string, unknown>;
    paymentMeta?: Record<string, unknown>;
    paymentInitiatedAt?: unknown;
    paymentCompletedAt?: unknown;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
}