import { EventEmitter } from 'events';
import { TrafficItem, MockRule } from '../types';

export class TrafficInspector extends EventEmitter {
  private items: TrafficItem[] = [];
  private maxItems: number = 500;
  private mockRules: MockRule[] = [];

  constructor(maxItems = 500) {
    super();
    this.maxItems = maxItems;
  }

  public setMockRules(rules: MockRule[]): void {
    this.mockRules = rules;
  }

  public getMockRules(): MockRule[] {
    return this.mockRules;
  }

  public getItems(): TrafficItem[] {
    return [...this.items];
  }

  public clearItems(): void {
    this.items = [];
    this.emit('clear');
  }

  /**
   * Checks if an incoming request matches any active mock rule.
   */
  public findMatchingMock(host: string, method: string, pathname: string): MockRule | undefined {
    const cleanHost = host.split(':')[0].toLowerCase();
    return this.mockRules.find(r => {
      if (!r.enabled) return false;
      if (r.method !== '*' && r.method.toUpperCase() !== method.toUpperCase()) return false;
      if (r.domain !== '*' && r.domain.toLowerCase() !== cleanHost) return false;
      return pathname.startsWith(r.path);
    });
  }

  /**
   * Records a completed request/response transaction.
   */
  public recordItem(item: Omit<TrafficItem, 'id' | 'curlCommand'>): TrafficItem {
    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const curlCommand = this.generateCurl(item);

    const fullItem: TrafficItem = {
      ...item,
      id,
      curlCommand
    };

    this.items.unshift(fullItem);
    if (this.items.length > this.maxItems) {
      this.items.pop();
    }

    this.emit('traffic', fullItem);
    return fullItem;
  }

  /**
   * Generates a reproducible cURL command string.
   */
  private generateCurl(item: Omit<TrafficItem, 'id' | 'curlCommand'>): string {
    const parts = [`curl -X ${item.method}`];

    for (const [k, v] of Object.entries(item.requestHeaders)) {
      if (!v) continue;
      const val = Array.isArray(v) ? v.join(', ') : v;
      if (['host', 'content-length'].includes(k.toLowerCase())) continue;
      parts.push(`-H "${k}: ${val}"`);
    }

    if (item.requestBody && ['POST', 'PUT', 'PATCH'].includes(item.method.toUpperCase())) {
      const escaped = item.requestBody.replace(/"/g, '\\"');
      parts.push(`-d "${escaped}"`);
    }

    parts.push(`"${item.url}"`);
    return parts.join(' \\\n  ');
  }
}
