import type { DatabaseHealth } from '../ports/database-health.js';
export class CheckReadiness {
  constructor(private readonly database: DatabaseHealth) {}
  async execute(): Promise<boolean> {
    try {
      await this.database.ping();
      return true;
    } catch {
      return false;
    }
  }
}
