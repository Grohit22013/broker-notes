import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** The broker's User.id — used to scope every database query. */
      id: string;
    } & DefaultSession["user"];
  }
}
