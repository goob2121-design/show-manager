import { AvailableSeatsView, loadDefaultAvailableSeatsShow } from "./shared";

export default async function AvailableSeatsPage() {
  const show = await loadDefaultAvailableSeatsShow();
  return <AvailableSeatsView show={show} />;
}
