import React, { useEffect } from "react";
import { hostBridge } from "src/features/embed/hostBridge";
import { useHostCovered } from "src/features/embed/useHostBridge";

// Inside a host app (#264): says `ready` once the app has rendered, and puts
// a blank, neutral cover over everything (toasts included) while the host
// has panicked or locked. Renders nothing elsewhere.
const HostBridgeRoot: React.FC = () => {
  const covered = useHostCovered();

  useEffect(() => {
    hostBridge.sendReady();
  }, []);

  if (!covered) return null;
  return <div data-slot="host-cover" aria-hidden="true" className="fixed inset-0 bg-background" style={{ zIndex: 2147483647 }} />;
};

export default HostBridgeRoot;
