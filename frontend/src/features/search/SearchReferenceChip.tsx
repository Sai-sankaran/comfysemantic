// covers: SRC-08
import { Button } from '../../components/ui';

export type SearchReferenceChipProps = {
  reference: {
    itemId: string;
    filename: string;
    thumbnailUrl: string | null;
    libraryId: string;
    libraryName: string;
  };
  onClear: () => void;
};

export function SearchReferenceChip({ reference, onClear }: SearchReferenceChipProps) {
  return (
    <div className="search-reference-chip">
      {reference.thumbnailUrl && (
        <img
          src={reference.thumbnailUrl}
          alt={reference.filename}
          width={32}
          height={32}
        />
      )}
      <span>{reference.filename}</span>
      <Button variant="ghost" onClick={onClear}>
        ✕
      </Button>
    </div>
  );
}