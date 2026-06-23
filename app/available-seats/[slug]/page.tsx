import { AvailableSeatsView, loadAvailableSeatsShowBySlug } from "../shared";

type AvailableSeatsBySlugPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AvailableSeatsBySlugPage({ params }: AvailableSeatsBySlugPageProps) {
  const { slug } = await params;
  const show = await loadAvailableSeatsShowBySlug(slug);
  return <AvailableSeatsView show={show} />;
}
