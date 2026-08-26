CREATE TYPE "QuickRouterEndpoint" AS ENUM ('main', 'direct');

ALTER TABLE "User"
ADD COLUMN "quickRouterEndpoint" "QuickRouterEndpoint" NOT NULL DEFAULT 'main';
