import { stime, type XY } from "@thegraid/common-lib";
import type { NamedObject } from "@thegraid/easeljs-lib";
import { Bitmap } from "@thegraid/easeljs-module";
import { TP } from "./table-params";

/** Simple async Image loader [from ImageReveal.loadImage()]
 *
 * see also: createjs.ImageLoader, which we don't use.
 */
export class ImageLoader {
  static ipser = 0; // debug
  /**
   * Promise to load url as HTMLImageElement
   */
  loadImage(fname0: string, ext = this.ext): Promise<HTMLImageElement> {
    const fname = fname0.split('.')[0];
    const ip0  = this.ipmap.get(fname);
    if (ip0) {
      return ip0;
    }
    const url = `${this.root}${fname}.${ext}`;
    //console.log(stime(`image-loader: try loadImage`), url)
    const ip = new Promise<HTMLImageElement>((res, rej) => {
      const img: HTMLImageElement = new Image();
      img.onload = (evt => {
        (img as NamedObject).Aname = fname;
        this.imap.set(fname, img);  // record image as loaded!
        res(img);
      });
      img.onerror = ((err) => rej(`failed to load ${url} -> ${err}`));
      img.src = url; // start loading
    });
    // ip['Aname'] = `${fname}-${++ImageLoader.ipser}`;
    this.ipmap.set(fname, ip);
    return ip;
  }

  /**
   * load all fnames, return Promise.all()
   * @param fnames
   */
  loadImages(fnames = this.fnames, ext = this.ext) {
    fnames.forEach(fname => this.ipmap.set(fname, this.loadImage(fname, ext)));
    return this.imageMapPromise =  Promise.all(this.ipmap.values()).then(
      (images) => this.imap, (reason) => {
        console.error(stime(this, `loadImages failed: ${reason}`));
        return this.imap;
      });
  }

  /**
   *
   * @param args -
   * - root: path to image directory with trailing '/'
   * - fnames: string[] basenames of each image to load
   * - ext: file extension (for ex: 'png' or 'jpg')
   *
   * @param imap supply or create new Map()
   * @param cb invoked with (imap)
   */
  constructor(args: { root: string, fnames: string[], ext: string },
    cb?: (imap: Map<string, HTMLImageElement>) => void)
  {
    this.root = args.root;
    this.fnames = args.fnames;
    this.ext = args.ext;
    if (cb) {
      this.loadImages().then(imap => cb(imap));
    }
  }
  imap = new Map<string, HTMLImageElement>();
  ipmap = new Map<string, Promise<HTMLImageElement>>();
  readonly root: string;
  readonly fnames: string[];
  readonly ext: string;
  imagePromises: Promise<HTMLImageElement>[];
  imageMapPromise: Promise<Map<string, HTMLImageElement>>
}


export class AliasLoader {
  static loader: AliasLoader = new AliasLoader();
  // Uname = ['Univ0', 'Univ1']; // from citymap
  constructor(fnames: string[] = [], aliases: { [key: string]: string } = {}) {
    this.aliases = aliases;
    this.fnames = fnames;
  }

  /**
   * Map key name to actual file name, so imageArgs.fnames can be more stable.
   *
   * fnames: this.fromAlias(['name1', 'name2', ...])
   *
   * 'name1' can be actual filename, or an alias.
   */
  aliases: { [key: string]: string } = { }

  /**
   * filenames, sans directory and extension (which are supplied from imageArgs)
   */
  set fnames(fnames: string[]) {
    this.imageArgs.fnames = this.fromAlias(fnames);
  };
  get fnames() {
    return this.imageArgs.fnames;
  }

  fromAlias(names: string[]) {
    return names.map(name => this.aliases[name] ?? name);
  }
  /** initial default: 'assets/image/' [] 'png' */
  imageArgs = {
    root: 'assets/images/',
    fnames: [] as string[],
    ext: 'png',
  };

  imageLoader: ImageLoader;
  /** use ImageLoader to load images, THEN invoke callback. */
  loadImages(cb?: (imap?: Map<string, HTMLImageElement>) => void) {
    this.imageLoader = new ImageLoader(this.imageArgs, (imap) => cb?.(imap));
  }

  /** lookup image form ImageLoader imap, using aliases[name] ?? name. */
  getImage(name: string) {
    return this.imageLoader.imap.get(this.aliases[name] ?? name);
  }

  /**
   * new Bitmap(this.getImage(name));
   *
   * Set scaleX & scaleY to render to given size.
   *
   * offset (either regXY or XY) so image is centered at 0,0
   *
   * @param name from this.imap.keys();
   * @param size [TP.hexRad] bitmap.scaleXY = size / max(img.width, img.height)
   * @param offsetReg [true]
   * - if true: regX/Y = (w/2, h/2) and XY = (0, 0)
   * - if false: regX/Y = (0, 0) and XY = (-w/2, -h/2)
   * - either way: image renders centered around (0, 0);
   * @return new Bitmap() containing the named image (no image if name was not loaded)
   */
  getBitmap(name: string, size: number | XY = TP.hexRad, offsetReg = true ) {
    const img = this.getImage(name) as HTMLImageElement;
    const bm = new Bitmap(img);
    if (img) {
      const { width, height } = img;
      (typeof size === 'number') ?
        (size == 0) ? (bm.scaleX = bm.scaleY = 1)
          : (bm.scaleX = bm.scaleY = size / Math.max(height, width))
        : (bm.scaleX = size.x / width, bm.scaleY = size.y / height)
      if (offsetReg) {
        // offset using regX, regY so it is rotates around center of image:
        bm.regX = .5 * width;
        bm.regY = .5 * height;
      } else {
        // simple offset to center image: [legacy]
        bm.x = -.5 * width * bm.scaleX;
        bm.y = -.5 * height * bm.scaleY;
      }
      bm.setBounds(bm.x, bm.y, width, height); // QQQ: is it correct for offsetReg?
    }
    return bm
  }
}

