declare module "postject" {
  export interface InjectOptions {
    sentinelFuse?: string;
    machoSegmentName?: string;
    overwrite?: boolean;
  }
  export function inject(
    executablePath: string,
    resourceName: string,
    resourceData: Buffer | Uint8Array,
    options?: InjectOptions
  ): Promise<void>;
}
