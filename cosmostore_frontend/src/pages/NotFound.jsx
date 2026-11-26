import { Link } from "react-router-dom";
import { Button } from "../components/ui";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-32 text-center">
      <p className="font-display text-7xl font-semibold text-berry-300 mb-4">404</p>
      <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
      <p className="text-ink/55 mb-8">The page you're looking for doesn't exist or has moved.</p>
      <Button as={Link} to="/" variant="dark">Back to home</Button>
    </div>
  );
}
