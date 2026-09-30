# Classes e contratos

Visão simplificada dos tipos centrais, casos de uso e portas. Este é um mapa de
leitura, não uma declaração de que todas as interfaces TypeScript são classes
concretas. A fonte da verdade é `src/domain/` e `src/application/ports/`.

```mermaid
classDiagram
direction LR

class Supplier {
  <<value object>>
  taxId: TaxId
  name: string
}

class NormalizedPurchaseOrder {
  <<domain input>>
  clientId: ClientId
  externalNumber: string
  currency: CurrencyCode
  status: PurchaseOrderStatus
  issuedOn: IsoDate
  items: NormalizedPurchaseOrderItem[] | null
}

class NormalizedPurchaseOrderItem {
  <<domain input>>
  externalLine: number
  material: string
  purchaseUnit: string
  conversionFactor: DecimalText
  quantityOrdered: DecimalText
  quantityReceived: DecimalText
  unitPrice: DecimalText
}

class PurchaseOrder {
  <<domain entity>>
  id: string
  clientId: ClientId
  externalNumber: string
  ingestionVersion: number
  hasPendingBalance: boolean
}

class PurchaseOrderItem {
  <<domain entity>>
  id: string
  quantityPending: DecimalText
}

class PurchaseOrderSummary {
  <<read model>>
  id: string
  externalNumber: string
  itemCount: number
  pendingItemCount: number
}

class InvoiceCheckRequest {
  <<request>>
  clientId: ClientId
  purchaseOrderNumber: string
  supplierTaxId: TaxId
}

class InvoiceLine {
  material: string
  quantity: DecimalText
  totalValue: DecimalText
}

class ConferenceResult {
  <<domain result>>
  outcome: ConferenceOutcome
}

class Divergence {
  code: DivergenceCode
  field: string
  expected: string | null
  received: string | null
}

class ConferenceRecord {
  <<persisted record>>
  id: string
  purchaseOrderId: string
  purchaseOrderIngestionVersion: number
  checkedAt: IsoInstant
}

class SourceAdapter {
  <<interface>>
  deliveryFormat: DeliveryFormat
  checkStructure(payload, profile)
  read(payload, profile)
}

class ClientProfile {
  <<configuration>>
  clientId: ClientId
  deliveryFormat: DeliveryFormat
  formatVersion: string
  dateFormat: DateFormat
}

class ClientProfiles {
  <<interface>>
  find(clientId)
}

class InMemoryClientProfiles {
  <<adapter>>
}

class IngestPurchaseOrders {
  <<use case>>
  execute(payload)
}

class PurchaseOrderRepository {
  <<interface>>
  replaceSnapshot(snapshot)
  stageLooseItems(clientId, ingestionId, staged)
  finalizeStaged(clientId, ingestionId, externalNumber)
  findByExternalNumber(clientId, externalNumber)
  list(filters, page)
}

class ConferenceRepository {
  <<interface>>
  save(record)
  list(filters, page)
  summarize(filters)
}

class CheckInvoice {
  <<use case>>
  execute(invoice)
}

class PrismaPurchaseOrderRepository {
  <<adapter>>
}

class PrismaConferenceRepository {
  <<adapter>>
}

class NestedJsonAdapter {
  <<adapter>>
}

class PairedCsvAdapter {
  <<adapter>>
}

class FlatJsonAdapter {
  <<adapter>>
}

class SplitJsonAdapter {
  <<adapter>>
}

Supplier -- NormalizedPurchaseOrder : supplier
Supplier -- PurchaseOrder : supplier
NormalizedPurchaseOrder "1" o-- "0..*" NormalizedPurchaseOrderItem : items
PurchaseOrder "1" o-- "0..*" PurchaseOrderItem : items
NormalizedPurchaseOrderItem <|-- PurchaseOrderItem
InvoiceCheckRequest "1" o-- "1..*" InvoiceLine : lines
ConferenceResult <|-- ConferenceRecord
ConferenceRecord "1" o-- "1..*" Divergence : divergences
PurchaseOrderSummary ..> PurchaseOrder : projection

SourceAdapter ..> NormalizedPurchaseOrder : produces
SourceAdapter ..> NormalizedPurchaseOrderItem : stages
ClientProfiles ..> ClientProfile : provides
IngestPurchaseOrders --> SourceAdapter : reads
IngestPurchaseOrders --> ClientProfiles : finds profile
IngestPurchaseOrders --> PurchaseOrderRepository : persists
CheckInvoice --> PurchaseOrderRepository : loads order
CheckInvoice --> ConferenceRepository : saves result
PrismaPurchaseOrderRepository ..|> PurchaseOrderRepository : implements
PrismaConferenceRepository ..|> ConferenceRepository : implements
NestedJsonAdapter ..|> SourceAdapter : implements
PairedCsvAdapter ..|> SourceAdapter : implements
FlatJsonAdapter ..|> SourceAdapter : implements
SplitJsonAdapter ..|> SourceAdapter : implements
InMemoryClientProfiles ..|> ClientProfiles : implements
```
