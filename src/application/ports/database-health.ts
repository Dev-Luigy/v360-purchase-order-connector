export interface DatabaseHealth {
  ping(): Promise<void>;
}
