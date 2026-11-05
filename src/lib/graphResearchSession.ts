interface GraphSession { user: { id: string }; access_token: string }
interface GraphSessionServices {
  getSession(): Promise<GraphSession | null>;
  invoke(functionName: string, body: unknown, headers: { Authorization: string }): Promise<{ data: unknown; error: unknown }>;
}

/** Recheck the owner around every native request, and send the checked token
 * explicitly so a session change between the check and fetch cannot substitute
 * another user's token. Token refresh for this same owner remains supported. */
export function createOwnerBoundGraphInvoke(owner: string, services: GraphSessionServices) {
  const changed = () => Object.assign(new Error('Votre session a changé. Rouvrez la recherche avec le compte actuel.'), { status: 401 });
  const checkedSession = async () => {
    const session = await services.getSession();
    if (!session || session.user.id !== owner || !session.access_token) throw changed();
    return session;
  };
  const assertOwner = async (expectedUserId: string) => {
    if (expectedUserId !== owner) throw changed();
    await checkedSession();
  };
  const invokeAI = async (functionName: string, body: unknown) => {
    const session = await checkedSession();
    const response = await services.invoke(functionName, body, { Authorization: 'Bearer ' + session.access_token });
    await assertOwner(owner);
    return response;
  };
  return { invokeAI, assertOwner };
}
