import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { checkThresholds, formatUSD, subscribeBudgetEvents } from "../../features/spending/spending";

// Shows the monthly limit's warnings (#42) as toasts, wherever the call that
// crossed it was made. Each toast has a button to the Spending settings,
// where the limit can be raised. Renders nothing itself.
const SpendingAlerts = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const action = { label: "Raise limit", onClick: () => navigate("/settings/spending") };
    const unsubscribe = subscribeBudgetEvents((event) => {
      const limit = formatUSD(event.budget.monthlyLimit);
      const spent = formatUSD(event.spent);
      if (event.type === "blocked") {
        // Fixed id: a burst of blocked background calls updates one toast
        // instead of stacking.
        toast.error(`Monthly limit reached (${spent} of ${limit})`, {
          id: "spending-blocked",
          description: "Paid calls are paused. Raise the limit, or switch to a local provider.",
          action,
        });
      } else if (event.level === 80) {
        toast.warning(`You've used 80% of your ${limit} monthly limit`, {
          id: "spending-threshold",
          description: `${spent} spent so far this month (estimated).`,
          action,
        });
      } else {
        toast.warning(`You've reached your ${limit} monthly limit`, {
          id: "spending-threshold",
          description:
            event.budget.mode === "block"
              ? `${spent} spent (estimated). New paid calls are paused until you raise the limit.`
              : `${spent} spent (estimated). Paid calls still work; this limit only warns.`,
          action,
          duration: 10_000,
        });
      }
    });
    // A limit crossed in an earlier visit, or lowered below this month's
    // spending, still gets its one warning when the app opens.
    checkThresholds();
    return unsubscribe;
  }, [navigate]);

  return null;
};

export default SpendingAlerts;
