import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { hostBridge } from "src/features/embed/hostBridge";

// The host's `open` (#264): a story to adapt goes to the new story page
// (#262) with its text pasted and its title filled. Lives inside the router;
// a request made while the app was still starting is picked up on mount.
const HostRouterBridge = () => {
  const navigate = useNavigate();

  useEffect(
    () =>
      hostBridge.onOpen((adaptStory) => {
        navigate("/stories/new", { state: { adaptStory, at: Date.now() } });
      }),
    [navigate]
  );

  return null;
};

export default HostRouterBridge;
