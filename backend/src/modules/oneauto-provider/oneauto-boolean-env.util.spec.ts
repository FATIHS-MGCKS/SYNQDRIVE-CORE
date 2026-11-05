import oneautoProviderConfig from '../../config/oneauto-provider.config';

describe('readOneAutoBooleanEnv via oneautoProvider config', () => {
  const prev = process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED;
    } else {
      process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = prev;
    }
  });

  function loadFlag(): boolean {
    const cfg = oneautoProviderConfig();
    return cfg.oeServiceHistoryIngestionEnabled === true;
  }

  it('treats true and 1 as enabled', () => {
    process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = 'true';
    expect(loadFlag()).toBe(true);
    process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = '1';
    expect(loadFlag()).toBe(true);
  });

  it('treats false and 0 as disabled', () => {
    process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = 'false';
    expect(loadFlag()).toBe(false);
    process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = '0';
    expect(loadFlag()).toBe(false);
  });

  it('defaults to disabled when unset', () => {
    delete process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED;
    expect(loadFlag()).toBe(false);
  });

  it('does not enable on unknown values', () => {
    process.env.ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED = 'maybe';
    expect(loadFlag()).toBe(false);
  });
});
