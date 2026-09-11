import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <h1 className="text-4xl font-bold text-foreground mb-4">404 - Page Not Found</h1>
      <p className="text-lg text-muted-foreground mb-6">
        Sorry, the page you're looking for doesn't exist.
      </p>
      <Button onClick={() => navigate("/")} className="rounded-full px-6 shadow-md">
        Go Home
      </Button>
    </div>
  );
};

export default NotFound;
