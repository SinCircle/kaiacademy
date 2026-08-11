import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedRegistrationEmail,
  REGISTRATION_EMAIL_DOMAINS,
} from "../db/security.ts";

test("accepts only the configured registration email domains", () => {
  assert.deepEqual(REGISTRATION_EMAIL_DOMAINS, [
    "mails.ucas.ac.cn",
    "gmail.com",
    "outlook.com",
    "qq.com",
    "163.com",
  ]);
  for (const domain of REGISTRATION_EMAIL_DOMAINS) {
    assert.equal(isAllowedRegistrationEmail(`researcher@${domain}`), true);
  }
  assert.equal(isAllowedRegistrationEmail("researcher@GMAIL.COM"), true);
  assert.equal(isAllowedRegistrationEmail("researcher@hotmail.com"), false);
  assert.equal(isAllowedRegistrationEmail("researcher@sub.gmail.com"), false);
  assert.equal(isAllowedRegistrationEmail("not-an-email"), false);
});
