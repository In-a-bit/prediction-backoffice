import { Card, CardBody, CardHeader } from "@/components/ui";
import { AddAssetClient } from "./add-asset-client";

export function AddAssetSection({
  existingBases,
}: {
  existingBases: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">Add asset</h2>
        <p className="text-xs text-foreground-muted mt-0.5">
          Loads supported USDT-quoted pairs from the resolution source on
          demand. Type to filter.
        </p>
      </CardHeader>
      <CardBody>
        <AddAssetClient existingBases={existingBases} />
      </CardBody>
    </Card>
  );
}
