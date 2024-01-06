import { AT, S, stime } from "@thegraid/common-lib";
import {} from "wicg-file-system-access"

export interface ILogWriter {
  writeLine(text: string): void | Promise<void>
}
class FileBase {
  constructor(public name = 'logFile', public buttonId = "fsOpenFileButton") {
  }
  /** FileHandle obtained from FilePicker Button. */
  fileHandle: FileSystemFileHandle;

  /** stime ident string in 'red' */
  ident(id: string, color: AT.AnsiKey = 'red') { return AT.ansiText([color], `.${id}:`) }

  /** multi-purpose picker button: (callback arg-type changes)
   *
   * @param method 'showOpenFilePicker' | 'showSaveFilePicker' | 'showDirectoryPicker'
   * @param options from "wicg-file-system-access":
   * - OpenFilePickerOptions { multiple?: boolean }
   * - SaveFilePickerOptions { suggestedName?: string }
   * - DirectoryPickerOptions {}
   * @param cb returns the fileHandle/fileHandleAry
   * @param inText set innerText of button ['OpenFile', 'SaveFile', 'Directory'] based on method
   */
  setButton(method: 'showOpenFilePicker' | 'showSaveFilePicker' | 'showDirectoryPicker',
    options: (OpenFilePickerOptions | SaveFilePickerOptions | DirectoryPickerOptions),
    cb: (fileHandleAry: any) => void, inText = method.substring(4, method.length - 6))
  {
    const picker = window[method]  // showSaveFilePicker showDirectoryPicker
    const fsOpenButton = document.getElementById(this.buttonId) as HTMLElement; // must exist!
    fsOpenButton.innerText = inText
    fsOpenButton.onclick = () => {
      picker(options).then((value: any) => cb(value),
        (rej: any) => console.warn(`${method} failed: `, rej)
      );
    }
    return fsOpenButton
  }

}
/**
 * Supply a button-id in HTML, when user clicks the file is opened for write-append.
 *
 * Other code can: new LogWriter().writeLine('first line...')
 * to queue writes before user clicks.
 *
 * file is flushed/closed & re-opened after every writeLine.
 * (so log is already saved if browser crashes...)
 */
export class LogWriter extends FileBase implements ILogWriter {
  /** when fulfilled, value is a WriteableFileStream; from createWriteable(). */
  streamPromise: Promise<FileSystemWritableFileStream> | undefined;

  /** WriteableFileStream Promise that is fulfilled when stream is open & ready for write */
  async openWriteStream(fileHandle: FileSystemFileHandle = this.fileHandle,
    options: FileSystemCreateWritableOptions = { keepExistingData: true }) {
    const promise = fileHandle.createWritable(options), thus = this;
    this.streamPromise = promise;
    const x = promise.then(() => this.writeBacklog(thus));
    return promise;
  }

  /**
   * @param name suggested name for write file
   * @param atEnd insert at end-of-file; but remove before writeLine. [\n]
   * @param buttonId DOM id of button to click to bring up FilePicker
   */
  constructor(name = 'logFile', public atZero = '', public atEnd = '\n', buttonId = "fsOpenFileButton") {
    super(name, buttonId)
    this.setButtonToSaveLog();
  }

  setButtonToSaveLog(name: string = this.name) {
    const options = {
      id: 'logWriter',
      startIn: 'downloads', // documents, desktop, music, pictures, videos
      suggestedName: name,
      types: [{
          description: 'Text/Javascript Files',
          accept: { 'text/plain': ['.txt', '.js'], },
        }, ],
    };
    // console.log(stime(this, `.new LogWriter:`), { file: this.fileHandle })
    // Note return type changes: [FileHandle], [DirHandle], FileHandle
    this.setButton('showSaveFilePicker', options, (fileHandle: FileSystemFileHandle) => {
      this.fileHandle = fileHandle;
      this.fileName = fileHandle.name;
      console.log(stime(this, `${this.ident('FilePicker')}.picked:`), fileHandle)
      this.openWriteStream(fileHandle);
    }, 'SaveLog')
  }
  fileName?: string;
  xfileName?: string; // retain last fileName when file is closed

  backlog: string[] = [];
  writeLine(text = '') {
    const wasNoBacklog = (this.backlog.length === 0);
    this.backlog.push(`${text}\n`);
    if (wasNoBacklog && this.streamPromise) {
      this.writeBacklog(this); // try write new backlog.
    }
  }
  showBacklog() {
    console.log(stime(this, `.showBacklog:\n`));
    const backlog = this.backlog.join('');
    console.log(backlog);
  }

  /**
   * called when openWriteStream has fulfilled streamPromise with a new writeableStream.
   *
   * or when application invokes writeline when stream is already open.
   */
  async writeBacklog(thus = this) {
    //console.log(stime(this, ident), `Backlog:`, this.backlog.length, this.backlog)
    if (thus.backlog.length > 0) try {
      const stream = await thus.streamPromise as FileSystemWritableFileStream;     // indicates writeable is ready
      const fileHandle = await thus.fileHandle.getFile();
      const size = fileHandle.size;
      const line0 = (size === 0) ? this.atZero : '';
      await stream.seek(Math.max(0, size - this.atEnd.length));
      const nlines = thus.backlog.length;
      const lines = `${line0}${this.backlog.slice(0, nlines).join('')}${this.atEnd}`; // shift all lines; commit to writing
      await stream.write({ type: 'write', data: lines }); // write to tmp store
      await stream.close();                               // flush to file system.
      thus.backlog.splice(0, nlines);              // remove from backlog
      thus.streamPromise = thus.openWriteStream(); // begin open new stream (streamPromise will be fullfiled)
    } catch (err) {
      console.warn(stime(thus, thus.ident('writeBacklog')), `failed:`, err)
      throw err
    }
  }
  async closeFile() {
    if (this.streamPromise) try {
      const stream = await this.streamPromise;
      const promise = stream.close();
      this.streamPromise = undefined;
      this.xfileName = this.fileName;
      this.fileName = undefined;
      return promise;
    } catch (err) {
      console.warn(stime(this, `.closeFile failed:`), err)
      throw err
    }
  }

  pickLogFile(name = this.name) {
    const fsOpenButton = document.getElementById(this.buttonId) as HTMLElement;
    this.setButtonToSaveLog(name)
    fsOpenButton.click()
  }

  /** Old technique: creates a *new* file each time it saves/downloads the given Blob(text) */
  downloadViaHiddenButton(name: string, text: string) {
    const a = document.createElement('a');
    let blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.addEventListener(S.click, (e) => {
      setTimeout(() => URL.revokeObjectURL(a.href), 3 * 1000); // is there no completion callback?
    });
    a.click();
  }
}

export class LogReader extends FileBase  {
  constructor(name = 'logFile', buttonId = "fsReadFileButton") {
    super(name, buttonId)
  }

  pickFileToRead() {
    const fsOpenButton = document.getElementById(this.buttonId) as HTMLElement; // ASSERT: button element exists.
    let fileReadPromise = this.setButtonToReadFile()
    fsOpenButton.click();
    return fileReadPromise
  }

  /**  OpenFilePickerOptions:
   * - types?: FilePickerAcceptType[] | undefined;
   * - excludeAcceptAllOption?: boolean | undefined;
   * - multiple?: false;
   */
  setButtonToReadFile() {
    return new Promise<File>((fulfill => {
      this.setButton('showOpenFilePicker', {}, ([fileHandle]) => {
        this.fileHandle = fileHandle as FileSystemFileHandle;
        fulfill(this.fileHandle.getFile());
      }, 'LoadFile');
    }))
  }

  // async readPickedFile(fileReadPromise: File | Promise<File> = this.pickFileToRead()) {
  //   return this.readFile(await fileReadPromise)
  // }
  async readFile(file: File) {
    return new Promise<string>((fulfill) => {
      let fileReader = new FileReader()
      fileReader.onload = () => {
        fulfill(fileReader.result as string)
      }
      fileReader.readAsText(file) // , encoding=utf-8 => void!
    })
  }
}
