import { maskApiKey } from './settingsService';

describe('settingsService utility functions', () => {
  it('maskApiKey should mask key properly', () => {
    const masked = maskApiKey('sk-abcdefg12345');
    expect(masked).toBe('sk-ab...2345');
  });
});
