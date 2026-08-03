import type { EscalationPayload } from '../../api/generated/secure-ship'

export type ShipmentStatus =
  | 'label_created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'

export type PackageItem = {
  id: string
  description: string
  weightKg: number
  declaredValue: number
}

export type ShipmentCardData = {
  trackingNumber: string
  carrier: string
  origin: string
  destination: string
  status: ShipmentStatus
  estimatedDelivery: string
  lastUpdate: string
  items: PackageItem[]
}

export type ChatRole = 'user' | 'bot' | 'escalation'

export type ChatMessageData = {
  id: string
  role: ChatRole
  text: string
  timestamp: string
  shipments?: ShipmentCardData[]
  escalation?: EscalationPayload
  isTyping?: boolean
}
