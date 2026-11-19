/**
 * Spike S1 action: connectivity test for the SpecSmith Ping Rovo agent.
 * Rovo calls this when the agent invokes the `ping` action. The returned
 * object goes back to the agent, which relays it to the user.
 */
export interface PingPayload {
  message?: string;
}

export interface PingResult {
  reply: 'pong';
  serverTime: string;
  echo: string | null;
}

/** Pure: builds the response. Tested directly. */
export function buildPong(payload: PingPayload | undefined, now: Date): PingResult {
  return { reply: 'pong', serverTime: now.toISOString(), echo: payload?.message ?? null };
}

/**
 * Forge handler. Forge calls it as handler(payload, context), so it must not
 * take any other parameters.
 */
export function ping(payload: PingPayload | undefined): PingResult {
  const result = buildPong(payload, new Date());
  console.log(`[specsmith] ping received, message=${JSON.stringify(result.echo)}`);
  return result;
}
