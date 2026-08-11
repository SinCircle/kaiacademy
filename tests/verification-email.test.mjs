import assert from "node:assert/strict";
import test from "node:test";
import {
  VerificationEmailError,
  renderVerificationEmail,
  sendVerificationEmail,
} from "../email/verification-email.ts";

test("renders a readable HTML and plain-text verification message", () => {
  const email = renderVerificationEmail("012345", 8);

  assert.match(email.subject, /012345/);
  assert.match(email.text, /012345/);
  assert.match(email.text, /8 分钟/);
  assert.match(email.html, /012345/);
  assert.match(email.html, /8 分钟/);
});

test("sends the expected Resend request with an idempotency key", async () => {
  let capturedUrl;
  let capturedInit;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ id: "email_test_123" }), { status: 200 });
  };

  const result = await sendVerificationEmail(
    { apiKey: "re_private_test_key", from: "丐院 <verify@example.com>" },
    { to: " Person@Example.COM ", code: "654321", requestId: "request-123" },
    fakeFetch,
  );

  assert.equal(capturedUrl, "https://api.resend.com/emails");
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Authorization, "Bearer re_private_test_key");
  assert.equal(capturedInit.headers["Idempotency-Key"], "email-verification/request-123");
  assert.equal(capturedInit.headers["User-Agent"], "gaiyuan/1.0");
  assert.deepEqual(JSON.parse(capturedInit.body).to, ["person@example.com"]);
  assert.equal(result.id, "email_test_123");
  assert.equal(result.to, "person@example.com");
});

test("reports provider errors without leaking the API key", async () => {
  const apiKey = "re_do_not_leak_this_key";
  const fakeFetch = async () => new Response(
    JSON.stringify({ name: "validation_error", message: "The sender domain is not verified." }),
    { status: 403 },
  );

  await assert.rejects(
    sendVerificationEmail(
      { apiKey, from: "丐院 <verify@example.com>" },
      { to: "person@example.com", code: "654321", requestId: "request-403" },
      fakeFetch,
    ),
    (error) => {
      assert.ok(error instanceof VerificationEmailError);
      assert.equal(error.status, 403);
      assert.match(error.message, /sender domain is not verified/i);
      assert.doesNotMatch(error.message, new RegExp(apiKey));
      return true;
    },
  );
});

test("rejects malformed input before making a network request", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response();
  };

  await assert.rejects(
    sendVerificationEmail(
      { apiKey: "re_test", from: "verify@example.com" },
      { to: "not-an-email", code: "123456", requestId: "request-invalid" },
      fakeFetch,
    ),
    /收件邮箱格式不正确/,
  );
  assert.equal(calls, 0);
  assert.throws(() => renderVerificationEmail("12345"), /6 位数字/);
  assert.throws(() => renderVerificationEmail("123456", 0), /1 到 60 分钟/);
});
