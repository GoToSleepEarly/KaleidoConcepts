import { describe, expect, test } from "vitest";

import { verifyTeacherLogin } from "./auth";

describe("verifyTeacherLogin", () => {
  test("returns the teacher session user when credentials match a database user", async () => {
    const user = await verifyTeacherLogin(
      {
        user: {
          findUnique: async () => ({
            id: "user-1",
            username: "teacher",
            password: "123456",
            displayName: "教师账号",
          }),
        },
      },
      { username: "teacher", password: "123456" },
    );

    expect(user).toEqual({ displayName: "教师账号" });
  });

  test("returns null when the database user is missing or password differs", async () => {
    const missingUser = await verifyTeacherLogin(
      {
        user: {
          findUnique: async () => null,
        },
      },
      { username: "teacher", password: "wrong" },
    );

    const wrongPassword = await verifyTeacherLogin(
      {
        user: {
          findUnique: async () => ({
            id: "user-1",
            username: "teacher",
            password: "123456",
            displayName: "教师账号",
          }),
        },
      },
      { username: "teacher", password: "wrong" },
    );

    expect(missingUser).toBeNull();
    expect(wrongPassword).toBeNull();
  });
});
