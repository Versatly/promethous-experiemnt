import { expect, vi } from "vitest";

export function createThrowingPrometheusAuthOverrides(prefix: string) {
  const resolvePrometheusMethodMetadata = vi.fn(() => {
    throw new Error(`${prefix}: method metadata resolver should not be called`);
  });
  const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
    throw new Error(`${prefix}: planned metadata resolver should not be called`);
  });
  const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
    throw new Error(`${prefix}: planned preflight resolver should not be called`);
  });
  return {
    resolvePrometheusMethodMetadata,
    resolvePrometheusPlannedMethodMetadata,
    resolvePrometheusPlannedMethodPreflight,
  };
}

export function expectNoPrometheusAuthOverrideInvocations(
  overrides: ReturnType<typeof createThrowingPrometheusAuthOverrides>,
) {
  expect(overrides.resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
  expect(overrides.resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
  expect(overrides.resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
}

export function expectPrometheusAuthShortCircuitBeforeDispatch(args: {
  respond: ReturnType<typeof vi.fn>;
  handler?: ReturnType<typeof vi.fn>;
  authOverrides: ReturnType<typeof createThrowingPrometheusAuthOverrides>;
  expectedMessage: string;
}) {
  expect(args.respond).toHaveBeenCalledWith(
    false,
    undefined,
    expect.objectContaining({
      message: expect.stringContaining(args.expectedMessage),
    }),
  );
  if (args.handler) {
    expect(args.handler).not.toHaveBeenCalled();
  }
  expectNoPrometheusAuthOverrideInvocations(args.authOverrides);
}
