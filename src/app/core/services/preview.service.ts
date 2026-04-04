import {
  Injectable,
  ComponentRef,
  ApplicationRef,
  EnvironmentInjector,
  createComponent,
  Type
} from '@angular/core';
import { FilePreviewComponent, FilePreviewData } from '../../shared/components/file-preview/file-preview.component';

@Injectable({
  providedIn: 'root'
})
export class PreviewService {
  private componentRef: ComponentRef<FilePreviewComponent> | null = null;

  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector
  ) {}

  open(data: FilePreviewData): void {
    if (this.componentRef) {
      this.close();
    }

    // Create the component
    this.componentRef = createComponent(FilePreviewComponent, {
      environmentInjector: this.injector,
      elementInjector: this.injector // Basic injector
    });

    // Manually provide data and close callback
    // We use a bypass since we're creating it dynamically without a custom provider
    (this.componentRef.instance as any).data = data;
    (this.componentRef.instance as any).closeCallback = () => this.close();

    // Attach to application-wide change detection
    this.appRef.attachView(this.componentRef.hostView);

    // Append to body
    const domElem = (this.componentRef.hostView as any).rootNodes[0] as HTMLElement;
    document.body.appendChild(domElem);
  }

  close(): void {
    if (this.componentRef) {
      this.appRef.detachView(this.componentRef.hostView);
      this.componentRef.destroy();
      this.componentRef = null;
    }
  }
}
