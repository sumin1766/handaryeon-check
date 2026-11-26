import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getSessionPassword } from "./session-password";
import { authorizeNotification, readSolapiConfig, sendRegistrationNotification } from "./solapi-notification.server";

const sessionPasswordHeader = createMiddleware({ type: "function" }).client(async ({ next }) =>
  next({ headers: { "x-session-password": getSessionPassword() ?? "" } }),
);

/** Only the registration ID is input. Password is a verified request header; all message fields come from DB. */
export const resendPreRegistrationAlimtalk = createServerFn({ method: "POST" })
  .middleware([sessionPasswordHeader])
  .inputValidator((input: unknown) => z.object({ pre_registration_id: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data }) => {
    const db = await authorizeNotification(getRequestHeader("x-session-password"));
    return sendRegistrationNotification(db, data.pre_registration_id, false, readSolapiConfig());
  });