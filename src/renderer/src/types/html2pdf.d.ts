declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number[] | number
    filename?: string
    image?: {
      type?: string
      quality?: number
    }
    html2canvas?: {
      scale?: number
      useCORS?: boolean
      [key: string]: any
    }
    jsPDF?: {
      unit?: string
      format?: string
      orientation?: 'portrait' | 'landscape'
      [key: string]: any
    }
    pagebreak?: {
      mode?: string
      before?: string[]
      after?: string[]
      avoid?: string[]
    }
  }

  interface Html2PdfInstance {
    from(element: HTMLElement | string): Html2PdfInstance
    set(options: Html2PdfOptions): Html2PdfInstance
    save(): Promise<void>
    output(type: string, options?: any): Promise<any>
    then(callback: (result: any) => void): Html2PdfInstance
    catch(callback: (error: Error) => void): Html2PdfInstance
  }

  function html2pdf(): Html2PdfInstance
  function html2pdf(element: HTMLElement | string, options?: Html2PdfOptions): Html2PdfInstance

  export default html2pdf
}
