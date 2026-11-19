/**
 * Spike S1: Rovo action handler.
 * Rovo calls this when the SpecSmith Ping agent invokes the `ping` action.
 * The returned object is passed back to the agent, which relays it to the user.
 */
export function ping(payload) {
  const message = payload?.message ?? null;
  console.log(`[specsmith] ping received, message=${JSON.stringify(message)}`);
  return {
    reply: 'pong',
    serverTime: new Date().toISOString(),
    echo: message,
  };
}
