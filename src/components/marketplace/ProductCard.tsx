import { ShopifyProduct, formatPrice } from "@/lib/shopify";
import { Zap } from "lucide-react";

interface ProductCardProps {
  product: ShopifyProduct;
  pointPrice?: number;
  stock?: number;
  userPoints?: number;
  localProductId?: string;
  onClick: () => void;
}

const ProductCard = ({ product, pointPrice, stock, onClick }: ProductCardProps) => {
  const { node } = product;
  const image = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const outOfStock = stock !== undefined && stock <= 0;

  return (
    <div
      className={`group cursor-pointer rounded-2xl overflow-hidden bg-card border border-border/40 transition-all active:scale-[0.97] hover:border-primary/30 hover:shadow-lg ${outOfStock ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      {/* Image */}
      <div className="aspect-square overflow-hidden bg-secondary/20 relative">
        {image ? (
          <img
            src={image.url}
            alt={image.altText || node.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-xs">
            No image
          </div>
        )}

        {/* Out of stock overlay */}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/40 flex items-end p-2">
            <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Out of stock</span>
          </div>
        )}

        {/* XP badge — top right corner */}
        {pointPrice !== undefined && pointPrice > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-bold text-primary">{pointPrice.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-0.5">
        <h3 className="font-display font-semibold text-[13px] leading-snug line-clamp-2">
          {node.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {formatPrice(price.amount, price.currencyCode)}
        </p>
      </div>
    </div>
  );
};

export default ProductCard;
