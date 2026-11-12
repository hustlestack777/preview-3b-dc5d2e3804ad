import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOCKED_INQUIRY_EMAILS,
  SHAUN_INQUIRY_EMAILS,
  buildLrlInquiryEmail,
  lrlInquiryRecipients,
  validateLrlInquiry,
} from "./lrl-inquiry.js";

const JUSTIN = "acadianabathandcounter@gmail.com";
const valid = {
  name: "Alex Rivera",
  phone: "(337) 555-0142",
  email: "alex@example.com",
  business: "Rivera Homes",
  topic: "website",
  reachTime: "morning",
  comment: "Need a new site this winter.",
  sourceSite: "3 B's Tree Removal",
  sourcePage: "https://preview.example/",
};

test("recipients default to Shaun only and never include Justin", () => {
  const defaults = lrlInquiryRecipients();
  assert.deepEqual(defaults, [...SHAUN_INQUIRY_EMAILS]);
  assert.equal(defaults.includes(JUSTIN), false);
  assert.ok(BLOCKED_INQUIRY_EMAILS.includes(JUSTIN));
});

test("env lists are used but client inboxes are stripped", () => {
  const mixed = lrlInquiryRecipients(
    `${JUSTIN}, shaun.brasher@gmail.com, shaun@lagniapperealmlabs.com, ${JUSTIN}`,
  );
  assert.deepEqual(mixed, ["shaun.brasher@gmail.com", "shaun@lagniapperealmlabs.com"]);
  assert.deepEqual(lrlInquiryRecipients(JUSTIN), ["shaun.brasher@gmail.com"]);
});

test("validation requires name, phone, topic and reach time; email is optional", () => {
  assert.equal(validateLrlInquiry(valid).ok, true);
  assert.equal(validateLrlInquiry({ ...valid, email: "" }).ok, true);
  assert.equal(validateLrlInquiry({ ...valid, name: " " }).ok, false);
  assert.equal(validateLrlInquiry({ ...valid, phone: "555-1212" }).ok, false);
  assert.equal(validateLrlInquiry({ ...valid, email: "not-an-email" }).ok, false);
  assert.equal(validateLrlInquiry({ ...valid, topic: "hack" }).ok, false);
  assert.equal(validateLrlInquiry({ ...valid, reachTime: "midnight" }).ok, false);
});

test("email is clearly labeled as an LRL inquiry and names the source site", () => {
  const parsed = validateLrlInquiry(valid);
  assert.equal(parsed.ok, true);
  const email = buildLrlInquiryEmail(parsed.value);
  assert.match(email.subject, /^LRL inquiry from 3 B's Tree Removal: Alex Rivera$/);
  assert.match(email.text, /LRL inquiry — not a client lead/);
  assert.match(email.text, /Website/);
  assert.match(email.html, /not a client lead/);
  assert.equal(email.html.includes(JUSTIN), false);
});
