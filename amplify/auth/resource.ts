import { defineAuth } from "@aws-amplify/backend";

// Cognito user pool. Customers self-register with email; managers are added to the
// MANAGER group by an admin. Telegram is linked later as a profile attribute (Phase C),
// never used as the login identity.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    fullname: { required: false, mutable: true },
  },
  groups: ["MANAGER", "CUSTOMER"],
});
