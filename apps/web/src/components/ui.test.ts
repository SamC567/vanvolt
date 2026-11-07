import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './ui';

describe('safeHttpUrl', () => {
  it('accepts http(s) only', () => {
    expect(safeHttpUrl('https://www.victronenergy.com/x.pdf')?.hostname).toBe(
      'www.victronenergy.com',
    );
    expect(safeHttpUrl('http://example.com')).not.toBeNull();
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      'ms-msdt:/id x',
      'not a url',
      '',
    ])
      expect(safeHttpUrl(bad)).toBeNull();
  });
});
