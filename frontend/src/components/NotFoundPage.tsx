import { useAuth } from "@/contexts/AuthContext";

const NotFoundPage = () => {
  const { user } = useAuth();
  
  const handleGoHome = () => {
    window.location.href = user ? `/dashboard/${user.role}` : '/auth/login';
  };
  
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center space-y-4 p-6 max-w-md">
        <h1 className="text-4xl font-bold text-primary">404</h1>
        <h2 className="text-xl font-semibold">Page Not Found</h2>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="space-x-4">
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
          >
            Go Back
          </button>
          <button
            onClick={handleGoHome}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;