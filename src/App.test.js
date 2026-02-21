import { render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  jest.spyOn(global, "fetch").mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("renders hero title", async () => {
  render(<App />);
  const title = await screen.findByRole("heading", { name: /tarim (superapp|el kilavuzu)/i });
  expect(title).toBeInTheDocument();
});
