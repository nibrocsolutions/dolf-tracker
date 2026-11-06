import { Link } from "react-router-dom";
import { useTitle } from "../lib/useTitle";

export function NotFound() {
  useTitle("Not found");
  return (
    <section className="page">
      <h1>That page is off the fairway</h1>
      <p className="lede">The link doesn’t match a course or round on this device.</p>
      <Link className="btn btn-primary" to="/">
        Back home
      </Link>
    </section>
  );
}
