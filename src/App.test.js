import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders hero title", () => {
  render(<App />);
  const title = screen.getByText(/bitki hastaliklarini/i);
  expect(title).toBeInTheDocument();
});
