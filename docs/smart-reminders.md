# Smart reminders

Open the header bell for bills, trial expiries, debt payments, and goal-funding deadlines. Filter by type, open the related record, snooze for 1/3/7 calendar days, dismiss one due occurrence, or restore a hidden reminder.

The reminder window is the existing **Settings → Notification Threshold (Days)** setting, now adjustable from 1 to 30 days. Save the profile to apply a change. Overdue debt payments, expired active trials, and unfunded overdue goals remain visible outside the upcoming window. Funded or undated goals do not produce funding reminders.

Bills are based on recurring schedules and show the next occurrence, including today even when a stored next-payment date has rolled forward. They do not prove that an earlier bill was unpaid. Active expired trials remain available for review rather than being automatically assumed cancelled; update the trial's status after reviewing it. Previously archived trials are not automatically restored. Trial prices are labelled future cost rather than an amount owed.

Debts use recorded statements and payments through today; future payments cannot settle today's reminder. Goal reminders show the remaining funding amount and refresh after successful contributions, withdrawals, edits, and deletions. Opening a debt or goal focuses its record. Missing goal data is shown as a partial-data error rather than an all-clear message.

## Delivery and storage

These are **in-app** reminders, recalculated when the app is open. Dates use the device's calendar day, refresh on focus, and advance while the app stays open. This feature does not send new background push notifications, emails, or messages. The existing daily expense-entry push reminder remains separate in Settings.

Snooze and dismiss choices are stored per account on this device, including the due date in each reminder ID. A new billing or funding cycle is a new occurrence. Snoozes return on their selected calendar date. The hidden list allows restoring an occurrence. Neither action records a payment, alters a balance, funds a goal, or cancels a subscription.

Preferences keep up to 500 recent occurrence actions per account. Storage failures leave reminders visible and show an error; malformed preferences can be restored from the menu. These choices do not sync between devices. Clearing app data removes the stored reminder preferences. Existing goals and debt storage must be set up for those sources; no additional migration is introduced by the reminder centre itself.

Run `npm run test:reminders` for schedule, date, recurrence, owner-scope, storage-failure, and snooze checks. `npm run test:goals` includes notifications emitted only after successful goal writes. Browser verification covers filters, persistence, restore, record navigation, goal updates, missing storage, and phone/desktop layouts.
