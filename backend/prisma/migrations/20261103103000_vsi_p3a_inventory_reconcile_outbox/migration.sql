-- P3A: native discovery inventory reconciliation outbox event types
ALTER TYPE "VsiProfileLifecycleOutboxEventType" ADD VALUE IF NOT EXISTS 'NATIVE_DISCOVERY_INVENTORY_SWEEP';
ALTER TYPE "VsiProfileLifecycleOutboxEventType" ADD VALUE IF NOT EXISTS 'NATIVE_DISCOVERY_INVENTORY_RECONCILE';
