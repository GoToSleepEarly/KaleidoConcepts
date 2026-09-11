import type { AccountAiSettings } from "@/lib/ai-gateway";

type LoginInput = {
  username: string;
  password: string;
};

type DbUser = {
  id: string;
  username: string;
  password: string;
  displayName: string;
  writingProvider: AccountAiSettings["writingProvider"];
  aiGateway: AccountAiSettings["aiGateway"];
  quickRouterEndpoint: AccountAiSettings["quickRouterEndpoint"];
  imageModel?: AccountAiSettings["imageModel"];
  imageGateway?: AccountAiSettings["imageGateway"];
  imageQuickRouterEndpoint?: AccountAiSettings["imageQuickRouterEndpoint"];
  textReasoningEffort?: AccountAiSettings["textReasoningEffort"];
  textStreamingEnabled?: AccountAiSettings["textStreamingEnabled"];
  textStreamFirstEventTimeoutSeconds?: AccountAiSettings["textStreamFirstEventTimeoutSeconds"];
  textStreamIdleTimeoutSeconds?: AccountAiSettings["textStreamIdleTimeoutSeconds"];
  textStreamMaxDurationSeconds?: AccountAiSettings["textStreamMaxDurationSeconds"];
  textNonStreamTimeoutSeconds?: AccountAiSettings["textNonStreamTimeoutSeconds"];
  imageQuality?: AccountAiSettings["imageQuality"];
};

export type AuthDb = {
  user: {
    findUnique: (query: { where: { username: string } | { id: string } }) => Promise<DbUser | null>;
    update: (query: { where: { id: string }; data: Partial<AccountAiSettings> }) => Promise<DbUser>;
  };
};

export async function verifyTeacherLogin(db: AuthDb, input: LoginInput) {
  const user = await db.user.findUnique({ where: { username: input.username } });

  if (!user || user.password !== input.password) {
    return null;
  }

  return { id: user.id, displayName: user.displayName };
}
