import { describe, it, expect } from 'vitest';
import { TrafficInspector } from '../src/core/traffic-inspector';
import { MockRule } from '../src/types';

describe('TrafficInspector', () => {
  it('should record requests and generate accurate cURL command', () => {
    const inspector = new TrafficInspector(50);

    const recorded = inspector.recordItem({
      timestamp: new Date().toISOString(),
      method: 'POST',
      url: 'https://api.my-app.local/v1/checkout',
      host: 'api.my-app.local',
      pathname: '/v1/checkout',
      status: 200,
      latencyMs: 14.5,
      requestHeaders: {
        'content-type': 'application/json',
        'authorization': 'Bearer test-token'
      },
      responseHeaders: {
        'content-type': 'application/json'
      },
      requestBody: '{"amount":1500,"currency":"RUB"}',
      responseBody: '{"status":"success"}',
      isMocked: false
    });

    expect(recorded.id).toBeDefined();
    expect(recorded.curlCommand).toContain('curl -X POST');
    expect(recorded.curlCommand).toContain('-H "content-type: application/json"');
    expect(recorded.curlCommand).toContain('\\"amount\\":1500');
    expect(recorded.curlCommand).toContain('https://api.my-app.local/v1/checkout');

    const items = inspector.getItems();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe(recorded.id);
  });

  it('should match registered mock rules correctly', () => {
    const inspector = new TrafficInspector();
    const rule: MockRule = {
      id: 'm1',
      name: 'Yookassa Webhook Mock',
      domain: 'api.my-app.local',
      path: '/api/webhook/yookassa',
      method: 'POST',
      statusCode: 200,
      delayMs: 0,
      headers: { 'Content-Type': 'application/json' },
      responseBody: '{"acknowledged": true}',
      enabled: true
    };

    inspector.setMockRules([rule]);

    // Matching request
    const match = inspector.findMatchingMock('api.my-app.local:443', 'POST', '/api/webhook/yookassa');
    expect(match).toBeDefined();
    expect(match?.statusCode).toBe(200);

    // Mismatched method
    const noMatchMethod = inspector.findMatchingMock('api.my-app.local', 'GET', '/api/webhook/yookassa');
    expect(noMatchMethod).toBeUndefined();

    // Mismatched domain
    const noMatchDomain = inspector.findMatchingMock('other.local', 'POST', '/api/webhook/yookassa');
    expect(noMatchDomain).toBeUndefined();
  });

  it('should limit ring buffer size to configured max', () => {
    const inspector = new TrafficInspector(5);
    for (let i = 0; i < 10; i++) {
      inspector.recordItem({
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: `http://localhost/item/${i}`,
        host: 'localhost',
        pathname: `/item/${i}`,
        status: 200,
        latencyMs: 1,
        requestHeaders: {},
        responseHeaders: {},
        isMocked: false
      });
    }

    const items = inspector.getItems();
    expect(items.length).toBe(5);
    expect(items[0].pathname).toBe('/item/9'); // most recent first
  });
});
